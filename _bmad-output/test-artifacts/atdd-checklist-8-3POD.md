---
inputDocuments:
  - _bmad-output/implementation-artifacts/8-3P-precisie-kalibratie-lokalisatie.md
  - _bmad-output/implementation-artifacts/8-3O-server-side-detectie-orkestratie.md
  - _bmad-output/implementation-artifacts/8-3D-t3777-declaratiebron.md
  - _bmad-output/implementation-artifacts/review-8-3POD-voorwerk.md
story_id: 8-3P/8-3O/8-3D
tdd_phase: red
---

# ATDD Checklist — Stories 8-3P / 8-3O / 8-3D (Epic 8-nazorg, vervolg)

**TDD-fase:** 🔴 RED — tests beschrijven verwacht gedrag en zijn geskipt tot de bijbehorende story geïmplementeerd is.

## Gegenereerde testbestanden (RED)

| Bestand | Niveau | Tests | Dekt | Status |
|---|---|---|---|---|
| `tests/test_localization_precision.py` | Unit/Handler (pytest) | 7 | 8-3P AC1/2/3/5 | ✅ 7 skipped, 0 failed (geverifieerd 2026-06-06) |
| `apps/api/src/__tests__/services/artwork-detection-orchestration.test.ts` | Unit (vitest) | 9 | 8-3O AC1/3 + crosscheck-refactor + O5/O6/S3 | ✅ laadt, 9 skipped (geverifieerd 2026-06-06) |

**8-3D:** ATDD volgt bij de story zelf (NÁ de gln-prerequisite uit 8-3O) — testcontract staat al in 8-3D AC5 (local-name-parse tegen echte ACC-XML-fixture, 4 onderscheiden fail-safe-paden, Redis-cache).

**Bewust uitgesloten:** 8-3O AC4 (crash-bestendigheid) krijgt zijn verplichte test bij implementatie volgens het bestaande 9.1-queue-testpatroon (BullMQ-mock) — het contract is te infra-specifiek voor een zinvolle red-phase-stub. 8-3P AC4 (ACC-hermeting) is per definitie geen unit-test.

## Module-contract (kern)

- **8-3P:** `LOCALIZE_SCALE_MIN_PX` default 64 · `LOCALIZE_CLASS_THRESHOLDS` (env-JSON, ML-side resolutie, `_parse_class_thresholds`) · multi-peak-extractie (max `LOCALIZE_PEAKS_PER_VARIANT`=3 lokale maxima, onderdrukkingsradius = variant-max-dim; SQDIFF-fallback blijft single-peak) · top-k-collapse `LOCALIZE_COLLAPSE_TOP_K`=3 · detectie-response bevat `threshold` · `match_templates`-signatuur byte-identiek; 4 beschermde tests blijven byte-identiek groen
- **8-3O:** `services/artwork-crosscheck.ts` (`crosscheckDetections(gtin, detections, declared)`) · `services/pipeline/detection-flow.ts` (`runDetectionJob`, `dedupDetections` — 8px-raster-quantisatie, `enqueueDetectionForImport` — per beeld/PDF-page) · `mlClient.localizeArtwork/classifyArtwork` · classify-uitbreiding `gtin`+`persist_crops`→`crop_path` · `getJobStatus(jobId, queueName?)` · import schrijft `gln`
