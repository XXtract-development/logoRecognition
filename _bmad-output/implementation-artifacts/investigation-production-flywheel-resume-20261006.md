# Investigation: production flywheel resume readiness

The installed skill catalog and searched skill directories contain no bmad-investigate skill. This case follows the required investigation method explicitly before any code/configuration fix.

## Symptom and evidence

The production dashboard shows a persistent migration pause. Actual deployed code inspection also confirms FLYWHEEL_NOMINATION_ENABLED=false and FLYWHEEL_KRUISCHECK_NOMINATION_ENABLED=false. Therefore clearing flywheel.paused alone would not activate candidate nomination. The production compose does not forward either variable. All four flywheel schedulers exist; no active, waiting or failed jobs, candidates or batches exist. Eighteen classes already reach the preserved default cap of10.

A real read-only baseline through the deployed API gate.measureBatch -> deployed ML /ml/regression-eval completed twice (18.84s/18.562s). It evaluated all654 active crop records with self-match exclusion and threshold0.90:397 correct/654=60.7034%. Positive ECHT:318/564 correct,246 missed. Negative VALS:79/90 correct,11 incorrectly recognized. This is the flywheel crop embedding correctness metric, not accuracy of strict public /detect and not PPV of predicted positives. Provenance labels describe stored sources, not newly verified human gold. No crop, gold record, weight or reference was modified.

The existing gate is a relative regression guard: it prevents deterioration against a baseline, not an absolute quality floor. Passing its measurement does not prove readiness for unattended automatic expansion.66 isolated existing tests pass across pause control, nomination, caps/dedup/outlier guardrails, promotion loop and regression gate.

## Hypotheses

Confirmed: migration pause is persisted and survives restarts; nomination flag is independently disabled; paused=false alone is insufficient. Confirmed: current embedding-based gold evaluation returns11 negative false matches at0.90. Refuted: absence of a dashboard precision means there are no usable crop records (654 were actually evaluated). Open: whether individual false matches arise from embedding separation, mislabeled/ambiguous gold, crop framing or source-family leakage; each needs pixel/provenance review before label correction or model retraining. Open: class caps/source attribution limit useful new nominations; no cap raised. Separate confirmed dashboard defects: missing optional flywheel index and mismatch-trends SQL group-by error; neither prevented the baseline evaluation and neither is repaired ad hoc.

## Owner and structural direction

Owner: apps/api/services/flywheel configuration and quality policy, apps/ml-service regression evaluation/reference embeddings, production deployment compose. First review all11 failing negatives with provenance and separately assess246 positive misses by class/family. Never relabel based on model disagreement alone. Then select an evidence-backed threshold/reference/model correction and validate on independent production-family negatives and positives. Preserve relative regression, dedup, caps, outliers, automatic pause, GHS exclusion and stale-baseline recalculation. Enable nomination only through reviewed production configuration; runtime activation requires explicit manual container approval under AGENTS.md. No production restart, pause clearance, flag write, threshold lowering, reference promotion or database mutation was performed. Migration aftercare remains active.

## Outcome

SAFE STOP for unattended flywheel expansion. Production recognition is unchanged.66 tests pass; actual quality measurements and configuration blocker retained. Resume is not reported as executed. Next coordinator step: provenance/pixel review of false-match negatives before deciding a correction; then configuration activation and controlled real queue verification.
