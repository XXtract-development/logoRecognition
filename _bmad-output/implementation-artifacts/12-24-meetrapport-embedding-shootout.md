# Meetrapport 12.24 — Embedding-shoot-out (offline, eigen data)

Datum: 2026-07-15 · wegwerp-container van het productie-image op vanilla,
getemperd (threads=3), read-only. Baseline via de échte `model_manager`
(productie-exact). Set: de bevroren 244 actieve referentie-crops (43 codes,
185 GTIN-groepen); evaluatie **leave-one-GTIN-out** (geen zelf-lek), 227
haalbare queries (zelfde-code-ref bestaat buiten de eigen GTIN). recall@4 op
code-niveau = dezelfde metriek als de Robotoff/OFF-benchmark.

## Resultaten

| model | dim | top-1 | recall@4 | NS-top1 | same-code p50 | cross-code p50 | **scheiding** | p50 ms | p95 ms |
|---|---|---|---|---|---|---|---|---|---|
| **efficientnet_b0 (huidig)** | 512 | 79% | **93%** | 28/45 | 0,937 | 0,720 | **0,216** | **20,7** | 25,9 |
| clip_vit_b16 | 512 | 77% | 92% | 17/45 | 0,966 | 0,864 | 0,102 | 223 | 237 |
| siglip_b16 | 768 | 79% | 93% | 25/45 | 0,966 | 0,835 | 0,131 | 228 | 249 |
| dinov2_small | 384 | 81% | 91% | 27/45 | 0,967 | 0,803 | 0,165 | 86,6 | 98,2 |

## Verdict: **NO-GO voor embedding-vervanging (nu)** — de externe +19–23 pt reproduceert niet

1. **Top-1/recall@4 zijn een gelijkspel** (±2 pt = ~5 queries op n=227). Geen
   van de kandidaten levert ook maar in de buurt van de OFF-winst.
2. **De huidige efficientnet_b0 heeft de BESTE drempel-scheiding** (0,216 vs
   0,102–0,165): same-code en cross-code liggen het verst uit elkaar — precies
   wat de live 0,75-drempel en de kruischeck-vloer nodig hebben. De
   CLIP-familie drukt álles naar hoge cosine (cross-code p50 0,80–0,86!),
   waardoor drempels veel krapper en fragieler worden.
3. **Kosten**: 4–11× trager op CPU (21 ms → 87–228 ms per crop) op een
   gedeelde host, voor nul aantoonbare winst.
4. **Nutri-Score bevestigt 12.22 opnieuw**: geen enkel embedding-model leest de
   letters betrouwbaar (17–28 van 45) — de deterministische familie-head blijft
   daar de juiste architectuur.

### Waarom de externe benchmark hier niet opgaat (duiding)

De OFF-benchmark vertrok van efficientnet_b0 met een generieke referentie-
situatie; **onze 12.3-pivot (echte-crop-referenties; top-1 37% → 81%) heeft die
winst al geoogst** langs een andere weg: de referentie-kwaliteit. Op een
in-domein referentiebibliotheek discrimineert efficientnet_b0 al op het niveau
waar de moderne encoders óók zitten — zonder hun drempel-compressie en
CPU-kosten.

### Beperkingen van deze meting (expliciet)

- Dit meet **referentie-discriminatie** (crop↔crop). De bekende zwakte
  **bootstrap-recall op rauwe pagina-kandidaten** (~20–28%) is hier NIET
  gemeten; dáár was de theoretische winst van CLIP-klasse-modellen. Een
  page-level-recall-meting is de enige route die dit verdict nog kan kantelen —
  alleen zinvol als het twee-traps-mitigatiepad (priming + 12.3-ranking, al
  besloten) tekort blijkt te schieten.
- Generatie-substitutie: SigLIP v1 i.p.v. SigLIP2 (transformers 4.38-stock) en
  DINOv2-S i.p.v. DINOv3-S (gated). Een generatiesprong verandert een
  0/+2-pt-gelijkspel niet aannemelijk in +19 pt; wel her-testen bij een
  eventuele page-level-vervolgmeting.
- n=227 haalbare queries; ±2 pt valt binnen de ruis.

## Consequenties

- **Schaduwfase/cutover (research Fase 2/3) wordt NIET gestart.** Bespaart 1–2
  weken migratie (re-embed, HNSW, drempel-herkalibratie, gate-hertraining).
- De huidige stack (efficientnet_b0 + pgvector + echte-crop-refs) is hiermee
  ook **positief gevalideerd** tegen drie moderne alternatieven.
- Vervolg-inzet verschuift naar wat wél bewezen werkt: per-familie heads
  (12.22-patroon; 12.25 A2-vangnet) en referentie-kwaliteit/dekking.

*Artefacten: `/tmp/shootout/` op vanilla (refs+manifest+embeddings+stats),
scripts `shootout_embed.py`/`shootout_eval.py` (scratchpad), log embed_log.txt.*
