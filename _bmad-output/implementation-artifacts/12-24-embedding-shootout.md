# Story 12.24: Embedding-shoot-out — SigLIP2 / CLIP / DINOv3 vs efficientnet_b0 (offline)

Status: ready-for-dev

<!-- Research rang 2 (research-technical-logo-herkenning-2026-07-14.md §4):
     Open Food Facts won +19–23 punten recall op exact onze architectuur en ons
     vertrekmodel door alléén het embedding-model te wisselen. Friso's go
     2026-07-15 ("ad 3 pak op"). Dit is de OFFLINE meet-fase (Fase 0/2-start);
     cutover/schaduwdraaien is een vervolg-story. -->

## Story

Als **systeem-eigenaar**,
wil ik met eigen cijfers weten welk modern embedding-model (SigLIP2-B/16,
CLIP-B/16, DINOv3-S) de nearest-reference-herkenning het meest verbetert t.o.v.
efficientnet_b0 — inclusief CPU-latency op onze eigen host,
zodat de keuze voor de embedding-vervanging (die álle ~900 codes, de gate, de
kruischeck én het vliegwiel tilt) op bewijs rust in plaats van op externe
benchmarks alleen.

## Aanpak (offline, read-only op bestaande data)

1. **Testset bevriezen**: (a) de ~130 actieve referentie-crops (alle codes) uit
   MinIO; (b) de gold-set; (c) de 212 PO-rejected hard-negatives; (d) een
   held-out crop-set met bekende labels (review-bevestigde crops per code,
   leave-one-GTIN-out zoals 12.21).
2. **Per kandidaat-model** (ONNX, CPU, int8 waar beschikbaar): alle sets
   embedden; nearest-reference-evaluatie (leave-one-GTIN-out): top-1-accuracy,
   recall@4, same-code vs cross-code similarity-verdeling (drempel-scheiding),
   gate-scheidbaarheid (AUC op positieven vs hard-negatives), en p50/p95-latency
   per crop op de vanilla-host (getemperd).
3. **Baseline**: identiek protocol met de huidige efficientnet_b0-embeddings.
4. **Verdict**: winnaar + aanbevolen drempels-range + go/no-go voor de
   schaduwfase (aparte story: model_version-kolom, HNSW, gate-hertraining,
   schaduwdraaien, cutover — zie research §7 Fase 2/3).

## Acceptance Criteria

1. Alle vier de modellen gemeten op identieke, bevroren sets; resultaten in een
   meetrapport (tabellen: top-1, recall@4, drempel-scheiding, AUC, latency).
2. Nutri-Score-familie apart gerapporteerd (bekende zwakte; de familie-head
   12.22 blijft daar de beslisser — de shoot-out meet de REST van de codes).
3. Read-only: geen wijziging aan reference_embeddings/live-pad; alles in een
   werkmap/wegwerp-container, 's nachts getemperd indien zwaar.
4. Verdict-sectie: aanbeveling + verwachte winst + risico's + vervolg-story-scope.

## Uitvoeringsnotities

- Modellen: SigLIP2-B/16 (Apache-2.0), CLIP ViT-B/16 (MIT; OFF-benchmark-winnaar
  in de B-klasse), DINOv3-ViT-S/16 (snelheids-alternatief). ONNX-export via
  transformers/optimum indien geen kant-en-klare export; int8 dynamic quant
  via onnxruntime. Downloads en runs op de vanilla-host (disk checken; modellen
  ~350-700 MB elk).
- Latency-meting met OMP/MKL=3 (gedeelde host) én met 1 thread (worker-profiel).
- Hergebruik meet-aanpak van 12.21-probes (leave-one-GTIN-out; declaratie/labels
  als grondwaarheid).

### References
- [Source: _bmad-output/planning-artifacts/research-technical-logo-herkenning-2026-07-14.md §4.1-4.5, §7]
- [Source: _bmad-output/implementation-artifacts/12-21-spike-nutriscore-herkenningsmechanisme.md] (meetprotocol)

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
