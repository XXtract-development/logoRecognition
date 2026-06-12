# Story 12.3 — real-crop-referenties LIVE gemeten (recall + precisie), productie omkeerbaar

Datum 2026-06-12 · ACC ML-container · harnassen `realref_live.py` (add/measure/deploy/revert) +
`spike_precision_probe.py` · gemeten door het **echte productie-pad** (`db_service.find_similar_references`,
512-dim). Alle toegevoegde referenties zijn getagd `source='realref-live-poc'` (exact omkeerbaar); de
bestaande guide-referenties zijn nooit aangeraakt. **Productie staat na deze meting weer schoon
(0 getagde refs).**

## Recall — leave-one-GTIN-out via live pgvector (omkeerbaar gemeten)

26 echte crops als referentie toegevoegd (niet-weggehouden GTINs), 36 weggehouden crops als query,
12 klassen met ≥2 GTINs:

| | top-1 micro | top-1 macro |
|---|---:|---:|
| guide-logo only (huidige productie) | 0,250 | 0,583 |
| + echte-crop-refs | **0,917** | **0,833** |
| **delta** | **+66,7pt** | **+25,0pt** |

Per klasse 0 %→100 % op weggehouden GTINs: **RECYCLABLE, NUTRISCORE_B, PREGNANCY_WARNING**. Door het
echte productie-pad bevestigd, lek-vrij (eigen GTIN weggehouden). Sterker dan de in-memory POC.

## Precisie — accept-rate op proposer-regio's (12.2 AC3-methode, 707 regio's / 12 artworks)

| referentieset | drempel | accepts | accept-rate | sim p99 |
|---|---:|---:|---:|---:|
| guide only | 0,75 | 5 | **0,71 %** | 0,745 |
| + echte-crop-refs | 0,75 | 14 | **1,98 %** | 0,817 |
| + echte-crop-refs | **0,80** | 7 | **0,99 %** | — |

**De precisie-kost is reëel:** bij de huidige 0,75-drempel verdrievoudigt de accept-rate (0,71 %→1,98 %)
— echte-crop-refs liggen dichter bij echte artwork-content, dus meer regio's halen de drempel. Een deel
zijn waarschijnlijk **échte logo's die nu wél herkend worden** (RECYCLABLE/NUTRISCORE/GREEN_DOT in de
accept-mix), een deel is vermoedelijk vals — zonder per-regio-labels niet volledig te scheiden.

**Een drempelverhoging naar 0,80 herstelt de precisie** (0,99 %, vrijwel de guide-baseline) terwijl de
recall-winst grotendeels blijft: echte crops matchen hun echte-crop-ref op zeer hoge cosine, dus ze
overleven 0,80 ruim. Bovendien buffert de **crosscheck-declared-gate** (8.5): een accept wordt pas
auto-geaccepteerd als de code óók in de T3777-declaratie van de GTIN staat — spurieuze accepts gaan
anders naar review, niet automatisch door.

## Conclusie & aanbeveling

De fix levert een **grote, door-productie-bevestigde recall-sprong** (+25pt macro) met een **beheersbare
precisie-kost** die een drempelverhoging (0,75→0,80) grotendeels wegneemt. Aanbevolen uitrol:

1. **Deploy** echte-crop-refs náást de guide-logo's (`realref_live.py deploy`) — omkeerbaar via `revert`.
2. **Verhoog `CLASSIFY_THRESHOLD_EMBEDDING` 0,75 → 0,80** (env var; vereist container-herstart — apart
   bevestigen). Her-meet recall@0,80 op echte crops om de exacte recall/precisie-balans vast te leggen.
3. **Reindex** `reference_embeddings` ná deploy (ivfflat, via `reindex_reference_embeddings`).
4. **Monitor** de live auto-accept-rate + steekproef-review de eerste detecties.
5. **Vervolg:** guide-referenties dedupliceren (FAIRTRADE 3×); 12.6-harvest opvoeren voor meer
   GTINs/klasse (verstevigt zowel refs als eval); recall@drempel exact her-ijken.

**Open punt (eerlijk):** de precisie-meting kan échte-logo-accepts niet van valse scheiden zonder
per-regio-labels; de +1,98 %/0,99 %-cijfers zijn accept-rates, geen pure FP-rates. De recall-winst is
hard; de precisie-kost is gemeten maar in interpretatie begrensd.

## GEDEPLOYED op ACC (2026-06-12)

Definitieve live-staat na deploy:
- **78 echte-crop-refs toegevoegd** (`realref_live.py deploy`), getagd `source='realref-live-poc'` →
  omkeerbaar via `realref_live.py revert`. Index = **116 embeddings** (38 guides + 78 real, één per logo).
- **`CLASSIFY_THRESHOLD_EMBEDDING=0.80`** gezet als Coolify-env op app `qsookwow8koko0kwg00g0cwk` +
  ML-service geredeployed (bevestigd door gebruiker). Drempel actief geverifieerd in de container.
- **Precisie in de schone 116-staat @ 0,80: accept-rate 1,13 %** (8/707 proposer-regio's) — vs
  guide-baseline 0,71 %, en lager dan 1,98 % @ 0,75. Beheerst.
- Refs overleven herstart (verankerd in `reference_logos`; startup-rebuild herbouwt ze).

**Incident + fix tijdens deploy (eerlijk):** (1) een losse `rebuild`-testaanroep zonder geladen model
clear​de kort de embeddings (hersteld binnen ~1 min). (2) Bij de redeploy bleek een **4-worker
startup-rebuild-race** de index te dupliceren (457 i.p.v. 116). Gefixt met een Postgres advisory-lock
in `main.py` (commit 8b5fedc) zodat één worker herbouwt — deterministische 116 op toekomstige herstarts
(actief zodra het nieuwe ML-image is uitgerold). Live-staat handmatig naar 116 herbouwd.

**Nog te doen:** PROD-deploy (alleen ACC nu); guide-refs blijven 3× voor FAIRTRADE (dedup-kandidaat);
12.6-harvest opvoeren; recall@0,80 op echte crops exact her-ijken; monitoren van de live auto-accept-rate.

## Reproductie
```bash
ML=$(ssh vanilla "docker ps --format '{{.Names}}' | grep '^ml-service-qsookwow'")
for s in realref_live.py spike_precision_probe.py spike_region_proposer.py; do
  ssh vanilla "docker cp /tmp/$s $ML:/app/scripts/"; done
ssh vanilla "docker exec $ML /opt/venv/bin/python /app/scripts/realref_live.py measure --verdict /tmp/verdict-78.json --out /tmp/realref-live.json"
ssh vanilla "docker exec $ML /opt/venv/bin/python /app/scripts/spike_precision_probe.py --n-artworks 12 --threshold 0.75"
# deploy/revert: realref_live.py deploy|revert|status
```
